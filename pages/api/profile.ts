import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "./[utils]";
import { GraphQLClient } from "graphql-request";

const RENOWN_ENDPOINT = process.env.NEXT_PUBLIC_RENOWN_ENDPOINT || "http://localhost:4001/graphql";

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
    ethAddress?: string;
    username?: string;
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
        const input = req.body as GetProfileInput;

        if (!input.ethAddress && !input.username) {
            res.status(400).json({ error: "Either ethAddress or username is required" });
            return;
        }

        try {
            const client = new GraphQLClient(RENOWN_ENDPOINT);
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
