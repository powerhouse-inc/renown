import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { GraphQLClient } from "graphql-request";

const SWITCHBOARD_ENDPOINT = process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || "https://switchboard.renown-staging.vetra.io/graphql";

const CREATE_DOCUMENT_MUTATION = `
    mutation RenownCredential_createDocument(
        $name: String!,
        $driveId: String
    ) {
        RenownCredential_createDocument(
            name: $name,
            driveId: $driveId
        )
    }
`;

const INIT_CREDENTIAL_MUTATION = `
    mutation RenownCredential_init(
        $driveId: String,
        $docId: PHID,
        $input: RenownCredential_InitInput
    ) {
        RenownCredential_init(
            driveId: $driveId,
            docId: $docId,
            input: $input
        )
    }
`;

const REVOKE_CREDENTIAL_MUTATION = `
    mutation RenownCredential_revoke(
        $driveId: String,
        $docId: PHID,
        $input: RenownCredential_RevokeInput
    ) {
        RenownCredential_revoke(
            driveId: $driveId,
            docId: $docId,
            input: $input
        )
    }
`;

interface InitCredentialInput {
    jwt: string;
    issuer?: string;
    subject?: string;
    audience?: string;
    payload?: string;
}

interface RevokeCredentialInput {
    jwt?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
    const client = new GraphQLClient(SWITCHBOARD_ENDPOINT);

    if (req.method === "POST") {
        // Create/Init a credential
        const { driveId, docId, input, documentName } = req.body as {
            driveId?: string;
            docId?: string;
            input: InitCredentialInput;
            documentName?: string;
        };

        if (!input || !input.jwt) {
            res.status(400).json({ error: "JWT is required in input" });
            return;
        }

        try {
            let finalDocId = docId;

            // If no docId provided, create a document first
            if (!finalDocId) {
                const name = documentName || `renown-credential-${Date.now()}`;
                const createDocResult = await client.request<{ RenownCredential_createDocument: string }>(
                    CREATE_DOCUMENT_MUTATION,
                    {
                        name,
                        driveId,
                    }
                );
                finalDocId = createDocResult.RenownCredential_createDocument;
                console.log("Created document with ID:", finalDocId);
            }

            // Initialize the credential with the document ID
            const data = await client.request(INIT_CREDENTIAL_MUTATION, {
                driveId,
                docId: finalDocId,
                input,
            });

            res.status(200).json({ result: data, documentId: finalDocId });
        } catch (e) {
            console.error("Failed to create credential:", e);
            res.status(500).json({ error: "Failed to create credential", details: String(e) });
        }
    } else if (req.method === "DELETE") {
        // Revoke a credential
        const { driveId, docId, input } = req.body as {
            driveId?: string;
            docId?: string;
            input: RevokeCredentialInput;
        };

        try {
            const data = await client.request(REVOKE_CREDENTIAL_MUTATION, {
                driveId,
                docId,
                input,
            });

            res.status(200).json({ result: data });
        } catch (e) {
            console.error("Failed to revoke credential:", e);
            res.status(500).json({ error: "Failed to revoke credential" });
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
}

export default allowCors(handler);
