import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { PowerhouseVerifiableCredential } from "../../../services/credential";
import { authenticateDID, storeCredential } from "../../../services/ceramic";

await authenticateDID();

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const credential = req.body.credential as PowerhouseVerifiableCredential;
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
            credential: result.data?.createVerifiableCredentialEIP712.document,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json(e);
        return;
    }
}

export default allowCors(handler);
