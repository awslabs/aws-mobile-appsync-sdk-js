import { AuthLink, AuthOptions, AUTH_TYPE, USER_AGENT_HEADER, USER_AGENT } from './auth-link';


export const createAuthLink = ({ url, region, auth }: { url: string, region: string, auth: AuthOptions }) => new AuthLink({ url, region, auth });

export { AuthLink, AuthOptions, AUTH_TYPE, USER_AGENT_HEADER, USER_AGENT };
export { Signer } from './signer';