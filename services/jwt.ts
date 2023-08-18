import * as jose from "jose";

const secret = new TextEncoder().encode("my-secret-token");

export async function generateJWT(accountAddress: string, publicKey: string) {
    const alg = "HS256";

    const jwt = await new jose.SignJWT({ "urn:example:claim": true })
        .setProtectedHeader({ alg })
        .setSubject(accountAddress.toLowerCase())
        // .setIssuedAt()
        // .setIssuer('urn:example:issuer')
        // .setAudience('urn:example:audience')
        // .setExpirationTime('2h')
        .sign(secret);

    return jwt;
}
