import { describeCredentialValidity, isDefaultCredentialValidity } from "../../utils/credential-validity";

interface CredentialValidityNoticeProps {
    expiresInDays: number;
}

/**
 * States how long the authorization will last when the requesting link asked
 * for a validity other than the default, so the user consents to it knowingly.
 */
export function CredentialValidityNotice({ expiresInDays }: CredentialValidityNoticeProps) {
    if (isDefaultCredentialValidity(expiresInDays)) return null;
    return (
        <p
            role="note"
            className="rounded-xl bg-muted px-4 py-3 text-center text-sm font-medium text-foreground"
        >
            {describeCredentialValidity(expiresInDays)}
        </p>
    );
}
