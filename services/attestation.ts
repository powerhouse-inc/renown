import {
    EAS,
    SchemaEncoder,
    ZERO_BYTES32,
} from "@ethereum-attestation-service/eas-sdk";
import EASContract from "@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json";
import type { SignerOrProvider } from "@ethereum-attestation-service/eas-sdk/dist/transaction";
import { Contract, Signer } from "ethers";

export type Attestation = {
    id: string;
    attester: string;
    expirationTime: number;
    revoked: boolean;
    decodedDataJson: string;
};

export type ConnectAttestation = {
    id: string;
    attester: string;
    expirationTime: number;
    revoked: boolean;
    type: string;
    publicKey: string;
};

const EASContractAddress = "0xAcfE09Fd03f7812F022FBf636700AdEA18Fd2A7A";
const SchemaUID =
    "0x26de46028d20cd4b57c75db54613232510e0ff47622b2cca47b64a83689a5b07";
const schemaEncoder = new SchemaEncoder("string type,string publicKey");

export async function getConnectAttestation(
    address: string,
    publicKey: string
): Promise<ConnectAttestation | undefined> {
    console.log(address, publicKey);
    const result = await fetch(`${process.env.NEXT_PUBLIC_EAS_SCAN}/graphql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            query: "query ConnectQuery($where: AttestationWhereInput) {\n  findFirstAttestation(where: $where) {\n    id\n    attester\n    decodedDataJson\n    revocable\n    revoked\n    expirationTime\n  }\n}\n",
            variables: {
                where: {
                    revoked: { equals: false },
                    attester: {
                        equals: address,
                    },
                    decodedDataJson: {
                        contains: `{"name":"publicKey","type":"string","signature":"string publicKey","value":{"name":"publicKey","type":"string","value":"${publicKey}"}}`,
                    },
                    schemaId: {
                        equals: SchemaUID,
                    },
                },
            },
            operationName: "ConnectQuery",
        }),
    })
        .then((res) => res.json())
        .catch((error) => console.error(error));

    const attestation = result.data?.findFirstAttestation as Attestation;
    if (!attestation) {
        return undefined;
    }
    const { id, attester, expirationTime, revoked, decodedDataJson } =
        attestation;

    const data = JSON.parse(decodedDataJson);
    const connectKey = data.find((value: any) => value.name === "publicKey")
        .value.value;
    const type = data.find((value: any) => value.name === "type").value.value;

    return {
        id,
        attester,
        expirationTime,
        revoked,
        publicKey: connectKey,
        type,
    };
}

export function checkConnectAttestation(
    attestation: ConnectAttestation,
    publicKey: string
) {
    return (
        !!attestation &&
        !attestation.revoked &&
        attestation.publicKey === publicKey &&
        attestation.type === "connect" &&
        (attestation.expirationTime === 0 ||
            attestation.expirationTime > new Date().getTime())
    );
}

export async function attestConnect(signer: Signer, publicKey: string) {
    const eas = new EAS(EASContractAddress, { signerOrProvider: signer });

    const encodedData = schemaEncoder.encodeData([
        { name: "type", value: "connect", type: "string" },
        { name: "publicKey", value: publicKey, type: "string" },
    ]);

    const tx = await eas.attest({
        schema: SchemaUID,
        data: {
            recipient: await signer.getAddress(), // TODO
            expirationTime: BigInt(0),
            revocable: true,
            data: encodedData,
        },
    });

    const newAttestationUID = await tx.wait();

    console.log("New attestation UID:", newAttestationUID);
    return newAttestationUID;
}

export async function revokeConnectAttestation(
    signer: SignerOrProvider,
    id: string
) {
    const eas = new EAS(EASContractAddress, { signerOrProvider: signer });
    const tx = await eas.revoke({ schema: SchemaUID, data: { uid: id } });
    return tx.wait();
}

export async function estimateAttestGas(
    signer: SignerOrProvider,
    publicKey: string
) {
    const encodedData = schemaEncoder.encodeData([
        { name: "type", value: "connect", type: "string" },
        { name: "publicKey", value: publicKey, type: "string" },
    ]);

    const contract = new Contract(EASContractAddress, EASContract.abi, signer);
    return contract.attest.estimateGas({
        schema: SchemaUID,
        data: {
            recipient: await signer.getAddress(), // TODO
            expirationTime: BigInt(0),
            revocable: true,
            data: encodedData,
            refUID: ZERO_BYTES32,
            value: 0,
        },
    });
}
