import { AuthLink, authLink, AuthOptions, AUTH_TYPE } from './auth-link';

export const createAuthLink = ({ url, region, auth }: { url: string, region: string, auth: AuthOptions }) => new AuthLink({ url, region, auth });

export { AuthLink, AuthOptions, AUTH_TYPE} ;