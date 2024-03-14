import { useEffect } from "react";
import { useCeramic } from "./ceramic";
import {
    useAccount,
    useWalletClient,
    useSignTypedData,
    useChainId,
} from "wagmi";
import {
    createPowerhouseVerifiableCredential,
    EIP712VC_CHAIN_ID,
    PowerhouseVerifiableCredential,
} from "../services/credential";
import { useState } from "react";
import { useMemo } from "react";
import { atom, useAtom } from "jotai";
import { useCallback } from "react";

interface ICredential {
    credential: PowerhouseVerifiableCredential | undefined;
    isAuth: boolean;
    hasCredential: boolean;
    loading: boolean;
    createCredential: () => Promise<PowerhouseVerifiableCredential | undefined>;
}

const credentialAtom = atom<PowerhouseVerifiableCredential | undefined>(
    undefined
);

export function useCredential(connectId: string): ICredential {
    const { data: walletClient } = useWalletClient();
    const { address } = useAccount();
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();
    const {
        session,
        login,
        getCredential: _getCredential,
        storeCredential,
    } = useCeramic(walletClient);
    const [credential, setCredential] = useAtom<
        PowerhouseVerifiableCredential | undefined
    >(credentialAtom);
    const [state, setState] = useState<
        "INITIAL" | "FETCHING_CREDENTIAL" | "ERROR" | "SUCCESS"
    >(credential ? "SUCCESS" : "INITIAL");

    const checkLogin = useCallback(async () => {
        if (session?.isAuthorized()) {
            return session;
        } else {
            const session = await login();
            return session;
        }
    }, [login, session]);

    async function getCredential(
        address: string,
        chainId: number,
        connectId: string
    ) {
        setState("FETCHING_CREDENTIAL");
        try {
            const credential = await _getCredential(
                address,
                chainId,
                connectId
            );
            if (credential) {
                setCredential(credential);
            }
            setState("SUCCESS");
        } catch (e) {
            setState("ERROR");
        }
    }

    const createCredential = useCallback(
        async (address: `0x${string}`, chainId: number, connectId: string) => {
            setState("FETCHING_CREDENTIAL");
            try {
                const credential = await createPowerhouseVerifiableCredential(
                    address,
                    chainId,
                    { id: connectId, app: "Connect" },
                    signTypedDataAsync
                );

                console.log("Credential created", credential);
                await checkLogin();
                const document = await storeCredential(credential);
                console.log("Credential stored", document);
                setCredential(credential);
                setState("SUCCESS");
                return credential;
            } catch (e) {
                console.error(e);
                setState("ERROR");
            }
        },
        [checkLogin, setCredential, signTypedDataAsync, storeCredential]
    );

    if (
        state === "INITIAL" &&
        chainId === EIP712VC_CHAIN_ID &&
        address &&
        connectId
        // TODO check if credential is valid (address changed)
    ) {
        getCredential(address, chainId, connectId);
    }

    return useMemo(
        () => ({
            credential,
            isAuth: session?.isAuthorized() ?? false,
            hasCredential: !!credential,
            loading: state === "FETCHING_CREDENTIAL",
            createCredential: () => {
                if (!address) {
                    throw new Error("Address is not set");
                }
                return createCredential(address, chainId, connectId);
            },
        }),
        [address, chainId, connectId, credential, session, state, login]
    );
}
