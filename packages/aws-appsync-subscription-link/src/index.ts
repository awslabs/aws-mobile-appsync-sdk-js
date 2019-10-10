import { SubscriptionHandshakeLink, CONTROL_EVENTS_KEY } from './subscription-handshake-link';
import { ApolloLink, Observable } from 'apollo-link';
import { createHttpLink } from 'apollo-link-http';
import { getMainDefinition } from 'apollo-utilities';
import { NonTerminatingLink } from './non-terminating-link';
import { OperationDefinitionNode } from 'graphql';
export const createSubscriptionHandshakeLink = (url: string, resultsFetcherLink: ApolloLink = createHttpLink({ uri: url })) => {
    return ApolloLink.split(
        operation => {
            const { query } = operation;
            const { kind, operation: graphqlOperation } = getMainDefinition(query) as OperationDefinitionNode;
            const isSubscription = kind === 'OperationDefinition' && graphqlOperation === 'subscription';

            return isSubscription;
        },
        ApolloLink.from([
            new NonTerminatingLink('controlMessages', {
                link: new ApolloLink((operation, _forward) => new Observable<any>(observer => {
                    const { variables: { [CONTROL_EVENTS_KEY]: controlEvents, ...variables } } = operation;

                    if (typeof controlEvents !== 'undefined') {
                        operation.variables = variables;
                    }

                    observer.next({ [CONTROL_EVENTS_KEY]: controlEvents });

                    return () => { };
                }))
            }),
            new NonTerminatingLink('subsInfo', { link: resultsFetcherLink }),
            new SubscriptionHandshakeLink('subsInfo'),
        ]),
        resultsFetcherLink,
    );
};