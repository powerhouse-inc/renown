import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { GraphQLClient } from "graphql-request";
import { storeAuthorization, revokeAuthorization } from "../../../services/authorization";

const SWITCHBOARD_ENDPOINT = process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || "http://localhost:4001/graphql";
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || "renown-profiles";

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
        // Create/Add an authorization
        const { driveId, docId, input } = req.body as {
            driveId?: string;
            docId?: string;
            input: InitCredentialInput;
        };

        if (!input || !input.jwt) {
            res.status(400).json({ error: "JWT is required in input" });
            return;
        }

        const finalDriveId = driveId || DEFAULT_DRIVE_ID;

        try {
            let finalDocId = docId;

            // If no docId provided, we need to find or create a RenownUser document
            if (!finalDocId) {
                // Extract eth address from the JWT subject
                // JWT subject format is typically "did:ethr:0x..."
                const ethAddress = input.subject?.replace(/^did:ethr:0x/, '0x') || input.subject;

                if (!ethAddress) {
                    res.status(400).json({ error: "Cannot determine user identity - JWT subject is required" });
                    return;
                }

                console.log("Looking for RenownUser with ethAddress:", ethAddress);

                // Try to find existing RenownUser document by eth address
                const GET_PROFILE_QUERY = `
                    query GetProfile($input: GetProfileInput!) {
                        getProfile(input: $input) {
                            documentId
                            ethAddress
                        }
                    }
                `;

                try {
                    const profileData = await client.request<{
                        getProfile: { documentId: string; ethAddress: string } | null;
                    }>(GET_PROFILE_QUERY, {
                        input: {
                            driveId: finalDriveId,
                            ethAddress,
                        },
                    });

                    if (profileData.getProfile) {
                        finalDocId = profileData.getProfile.documentId;
                        console.log("Found existing RenownUser document:", finalDocId);
                    }
                } catch (e) {
                    console.log("No existing profile found, will create new one");
                }

                // If still no document, create a new RenownUser document
                if (!finalDocId) {
                    console.log("Creating new RenownUser document");

                    const CREATE_USER_MUTATION = `
                        mutation CreateRenownUser($name: String!, $driveId: String) {
                            RenownUser_createDocument(name: $name, driveId: $driveId)
                        }
                    `;

                    const createResult = await client.request<{
                        RenownUser_createDocument: string;
                    }>(CREATE_USER_MUTATION, {
                        name: `User ${ethAddress.slice(0, 8)}`,
                        driveId: finalDriveId,
                    });

                    finalDocId = createResult.RenownUser_createDocument;
                    console.log("Created new RenownUser document:", finalDocId);

                    // Set the eth address on the new document
                    const SET_ETH_ADDRESS_MUTATION = `
                        mutation SetEthAddress($docId: PHID!, $input: RenownUser_SetEthAddressInput!) {
                            RenownUser_setEthAddress(docId: $docId, input: $input)
                        }
                    `;

                    await client.request(SET_ETH_ADDRESS_MUTATION, {
                        docId: finalDocId,
                        input: { ethAddress },
                    });

                    console.log("Set ethAddress on new document");
                }
            }

            // Generate a unique ID for this authorization
            const authId = `auth-${Date.now()}-${Math.random().toString(36).substring(7)}`;

            // Store authorization on the RenownUser document
            const success = await storeAuthorization({
                docId: finalDocId,
                id: authId,
                jwt: input.jwt,
                issuer: input.issuer,
                subject: input.subject,
                audience: input.audience,
                payload: input.payload,
            });

            if (success) {
                res.status(200).json({ result: true, documentId: finalDocId, authorizationId: authId });
            } else {
                res.status(500).json({ error: "Failed to store authorization" });
            }
        } catch (e) {
            console.error("Failed to store authorization:", e);
            res.status(500).json({ error: "Failed to store authorization", details: String(e) });
        }
    } else if (req.method === "DELETE") {
        // Revoke an authorization
        const { driveId, docId, input, ethAddress } = req.body as {
            driveId?: string;
            docId?: string;
            input: RevokeCredentialInput;
            ethAddress?: string;
        };

        console.log("DELETE /api/credential/renown called");
        console.log("Request body:", { driveId, docId, input, ethAddress });

        if (!input || !input.jwt) {
            res.status(400).json({ error: "JWT is required in input" });
            return;
        }

        const finalDriveId = driveId || DEFAULT_DRIVE_ID;

        try {
            let finalDocId = docId;

            // If no docId provided, try to find it by ethAddress
            if (!finalDocId && ethAddress) {
                console.log("Looking for RenownUser with ethAddress:", ethAddress);

                const GET_PROFILE_QUERY = `
                    query GetProfile($input: GetProfileInput!) {
                        getProfile(input: $input) {
                            documentId
                        }
                    }
                `;

                const profileData = await client.request<{
                    getProfile: { documentId: string } | null;
                }>(GET_PROFILE_QUERY, {
                    input: {
                        driveId: finalDriveId,
                        ethAddress,
                    },
                });

                if (profileData.getProfile) {
                    finalDocId = profileData.getProfile.documentId;
                    console.log("Found RenownUser document:", finalDocId);
                }
            }

            if (!finalDocId) {
                res.status(400).json({ error: "Could not find RenownUser document - provide docId or ethAddress" });
                return;
            }

            // We need to find the authorization by JWT to get its ID
            // This requires querying the document first
            const GET_USER_DOC_QUERY = `
                query GetRenownUser($docId: PHID!) {
                    RenownUser {
                        getDocument(docId: $docId) {
                            state {
                                authorizations {
                                    id
                                    jwt
                                    revoked
                                }
                            }
                        }
                    }
                }
            `;

            const userDocData = await client.request<{
                RenownUser: {
                    getDocument: {
                        state: {
                            authorizations: Array<{ id: string; jwt: string; revoked: boolean }>;
                        };
                    };
                };
            }>(GET_USER_DOC_QUERY, { docId: finalDocId });

            const authorization = userDocData.RenownUser.getDocument.state.authorizations.find(
                (auth) => auth.jwt === input.jwt && !auth.revoked
            );

            if (!authorization) {
                res.status(404).json({ error: "Authorization not found or already revoked" });
                return;
            }

            // Revoke the authorization
            const success = await revokeAuthorization({
                docId: finalDocId,
                authorizationId: authorization.id,
            });

            if (success) {
                console.log("Revoke successful");
                res.status(200).json({ result: true });
            } else {
                res.status(500).json({ error: "Failed to revoke authorization" });
            }
        } catch (e) {
            console.error("Failed to revoke authorization:", e);
            res.status(500).json({ error: "Failed to revoke authorization", details: String(e) });
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
}

export default allowCors(handler);
