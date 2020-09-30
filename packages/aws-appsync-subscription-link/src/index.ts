import {
  SubscriptionHandshakeLink,
  CONTROL_EVENTS_KEY
} from "./subscription-handshake-link";
import { ApolloLink, Observable, createHttpLink } from "@apollo/client";
import { getMainDefinition } from "apollo-utilities";
import { NonTerminatingLink } from "./non-terminating-link";
import { OperationDefinitionNode } from "graphql";

import {
  AppSyncRealTimeSubscriptionHandshakeLink
} from "./realtime-subscription-handshake-link";
import { UrlInfo } from "./types";

function createSubscriptionHandshakeLink(
  args: UrlInfo,
  resultsFetcherLink?: ApolloLink
): ApolloLink;
function createSubscriptionHandshakeLink(
  url: string,
  resultsFetcherLink?: ApolloLink
): ApolloLink;
function createSubscriptionHandshakeLink(
  infoOrUrl: UrlInfo | string,
  theResultsFetcherLink?: ApolloLink
) {
  let resultsFetcherLink: ApolloLink, subscriptionLinks: ApolloLink;

  if (typeof infoOrUrl === "string") {
    resultsFetcherLink =
      theResultsFetcherLink || createHttpLink({ uri: infoOrUrl });
    subscriptionLinks = ApolloLink.from([
      new NonTerminatingLink("controlMessages", {
        link: new ApolloLink(
          (operation, _forward) =>
            new Observable<any>(observer => {
              const {
                variables: { [CONTROL_EVENTS_KEY]: controlEvents, ...variables }
              } = operation;

              if (typeof controlEvents !== "undefined") {
                operation.variables = variables;
              }

              observer.next({ [CONTROL_EVENTS_KEY]: controlEvents });

              return () => {};
            })
        )
      }),
      new NonTerminatingLink("subsInfo", { link: resultsFetcherLink }),
      new SubscriptionHandshakeLink("subsInfo")
    ]);
  } else {
    const { url } = infoOrUrl;
    resultsFetcherLink = theResultsFetcherLink || createHttpLink({ uri: url });
    subscriptionLinks = new AppSyncRealTimeSubscriptionHandshakeLink(infoOrUrl);
  }

  return ApolloLink.split(
    operation => {
      const { query } = operation;
      const { kind, operation: graphqlOperation } = getMainDefinition(
        query
      ) as OperationDefinitionNode;
      const isSubscription =
        kind === "OperationDefinition" && graphqlOperation === "subscription";

      return isSubscription;
    },
    subscriptionLinks,
    resultsFetcherLink
  );
}

export { CONTROL_EVENTS_KEY, createSubscriptionHandshakeLink };
