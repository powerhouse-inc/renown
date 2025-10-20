import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "./[utils]";
import { GraphQLClient } from "graphql-request";

const SWITCHBOARD_ENDPOINT = process.env.NEXT_PUBLIC_SWITCHBOARD_ENDPOINT || "http://localhost:4001/graphql";
const DEFAULT_DRIVE_ID = process.env.NEXT_PUBLIC_RENOWN_DRIVE_ID || "renown-profiles";

const GET_PROFILE_QUERY = `
    query ($input: GetProfileInput!) {
        getProfile(input: $input) {
            createdAt
            documentId
            ethAddress
            updatedAt
            userImage
            username
        }
    }
`;

interface GetProfileInput {
    driveId: string;
    id?: string;
    ethAddress?: string;
    username?: string;
    searchInput?: string;
}

interface Profile {
    createdAt: string;
    documentId: string;
    ethAddress: string;
    updatedAt: string;
    userImage?: string;
    username?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === "POST") {
        const body = req.body;

        if (!body.id && !body.ethAddress && !body.username && !body.searchInput) {
            res.status(400).json({ error: "Either id, ethAddress, username, or searchInput is required" });
            return;
        }

        const input: GetProfileInput = {
            driveId: body.driveId || DEFAULT_DRIVE_ID,
            ...(body.id && { id: body.id }),
            ...(body.ethAddress && { ethAddress: body.ethAddress }),
            ...(body.username && { username: body.username }),
            ...(body.searchInput && { searchInput: body.searchInput }),
        };

        try {
            const client = new GraphQLClient(SWITCHBOARD_ENDPOINT);
            const data = await client.request<{ getProfile: Profile }>(
                GET_PROFILE_QUERY,
                { input }
            );

            res.status(200).json({ profile: data.getProfile });
        } catch (e) {
            console.error("Failed to fetch profile:", e);
            res.status(500).json({ error: "Failed to fetch profile" });
        }
    } else {
        res.status(405).json({ error: "Method not allowed" });
    }
}

export default allowCors(handler);
