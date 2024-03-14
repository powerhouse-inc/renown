import { DIDSession } from "did-session";
import { EthereumWebAuth, getAccountId } from "@didtools/pkh-ethereum";
import { atom, useAtom } from "jotai";
import {
    compose,
    storeCredential as ceramicStoreCredential,
    getCredentials as ceramicGetCredentials,
    CeramicPowerhouseVerifiableCredential,
} from "../services/ceramic";
import type { WalletClient } from "wagmi";
import {
    PowerhouseVerifiableCredential,
    getAddressDID,
} from "../services/credential";

const sessionAtom = atom<DIDSession | undefined>(undefined);

export function useCeramic(provider?: WalletClient) {
    const [session, setSession] = useAtom(sessionAtom);

    async function login() {
        if (!provider) {
            throw new Error("No provider");
        }

        if (!provider.account.address) {
            throw new Error("No address");
        }

        // TODO check local storage
        const accountId = await getAccountId(
            provider,
            provider.account.address
        );
        const authMethod = await EthereumWebAuth.getAuthMethod(
            provider,
            accountId
        );
        const session = await DIDSession.get(accountId, authMethod, {
            resources: compose.resources,
        });
        compose.setDID(session.did);
        setSession(session);
        return session;
    }

    async function getCredential(
        address: string,
        chainId: number,
        connectId: string
    ): Promise<PowerhouseVerifiableCredential | undefined> {
        const result = await ceramicGetCredentials(address, chainId, connectId);

        if (result.errors?.length) {
            throw result.errors[0];
        }
        const issuerId = getAddressDID(address, chainId);
        const ceramicCredential =
            result.data?.verifiableCredentialEIP712Index.edges.find(
                (e) =>
                    e.node.issuer.id === issuerId &&
                    e.node.credentialSubject.id === connectId
            )?.node;
        if (ceramicCredential) {
            const { context, ...credential } = ceramicCredential;
            return {
                ...credential,
                "@context": context,
            };
        }
    }

    async function storeCredential(credential: PowerhouseVerifiableCredential) {
        try {
            const response = await fetch("/api/auth/credential", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ credential }),
            });
            if (response.ok) {
                const body = await response.json();
                return body.credential as CeramicPowerhouseVerifiableCredential;
            } else {
                throw new Error(
                    `Failed to store credential: ${response.statusText}`
                );
            }
        } catch (e) {
            throw e;
        }
    }

    return {
        session,
        login,
        getCredential,
        storeCredential,
    };
}
