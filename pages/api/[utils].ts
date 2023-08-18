import { NextApiRequest, NextApiResponse, NextApiHandler } from "next";

export const allowCors =
    (fn: NextApiHandler) =>
    async (req: NextApiRequest, res: NextApiResponse) => {
        if (req.method === "OPTIONS") {
            res.status(200).end();
            return;
        }
        await fn(req, res);
    };
