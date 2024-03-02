import {
    createAgent as _createAgent,
    IResolver,
    IKeyManager,
    IDIDManager,
} from "@veramo/core";
import { DIDManager } from "@veramo/did-manager";
import { EthrDIDProvider } from "@veramo/did-provider-ethr";

import {
    BrowserLocalStorageStore,
    DIDStoreJson,
    DataStoreJson,
    KeyStoreJson,
} from "@veramo/data-store-json";
import { Resolver } from "did-resolver";
import { getResolver as ethrDidResolver } from "ethr-did-resolver";
import { KeyManager } from "@veramo/key-manager";
import { Web3KeyManagementSystem } from "@veramo/kms-web3";
import { IDataStore } from "@veramo/data-store";
import { BrowserProvider } from "ethers";
import { DIDResolverPlugin } from "@veramo/did-resolver";

const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_VITE_INFURA_PROJECT_ID;
if (!INFURA_PROJECT_ID) {
    throw new Error("INFURA_PROJECT_ID is undefined");
}

const DB_SECRET_KEY = process.env.NEXT_PUBLIC_VITE_DB_SECRET_KEY;
if (!DB_SECRET_KEY) {
    throw new Error("DB_SECRET_KEY is undefined");
}

const localStorageStore = BrowserLocalStorageStore.fromLocalStorage("veramo");

export function createAgent(provider: BrowserProvider) {
    return _createAgent<IResolver & IKeyManager & IDIDManager & IDataStore>({
        plugins: [
            new KeyManager({
                store: new KeyStoreJson(localStorageStore),
                kms: {
                    web3: new Web3KeyManagementSystem({
                        wagmi: provider as any,
                    }),
                },
            }),
            new DIDResolverPlugin({
                resolver: new Resolver({
                    ...ethrDidResolver({ infuraProjectId: INFURA_PROJECT_ID }),
                }),
            }),
            new DIDManager({
                store: new DIDStoreJson(localStorageStore),
                defaultProvider: "did:ethr:sepolia",
                providers: {
                    "did:ethr:sepolia": new EthrDIDProvider({
                        defaultKms: "local",
                        network: "sepolia",
                        name: "sepolia",
                        rpcUrl:
                            "https://sepolia.infura.io/v3/" + INFURA_PROJECT_ID,
                        gas: 1000001,
                        ttl: 31104001,
                    }),
                },
            }),
            new DataStoreJson(localStorageStore),
        ],
    });
}
