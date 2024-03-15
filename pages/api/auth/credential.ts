import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { PowerhouseVerifiableCredential } from "../../../services/credential";
import {
    authenticateDID,
    getCredentials,
    storeCredential,
} from "../../../services/ceramic";

await authenticateDID();

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === "GET") {
        const { address, chainId, connectId } = req.query;
        if (!connectId || !chainId || !address) {
            res.status(400).json({});
            return;
        }
        const result = await getCredentials(
            address as string,
            parseInt(chainId as string),
            connectId as string
        );

        if (result.errors?.length) {
            throw result.errors[0];
        }
        res.status(200).json({
            credential:
                result.data?.verifiableCredentialEIP712Index.edges[0]?.node,
        });
    } else if (req.method === "POST") {
        const credential = req.body
            .credential as PowerhouseVerifiableCredential;
        if (!credential) {
            res.status(400).json({});
            return;
        }

        try {
            const result = await storeCredential(credential);
            if (result.errors?.length) {
                throw result.errors[0];
            }
            res.status(200).json({
                credential:
                    result.data?.createVerifiableCredentialEIP712.document,
            });
        } catch (e) {
            console.error(e);
            res.status(500).json(e);
            return;
        }
    } else {
        res.status(405).json({});
    }
}

export default allowCors(handler);
