import { useState, useCallback, useMemo } from "react";

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

interface IRenownSwitchboard {
    profile: Profile | undefined;
    loading: boolean;
    error: Error | undefined;
    getProfile: (input: GetProfileInput) => Promise<void>;
}

export function useRenownSwitchboard(): IRenownSwitchboard {
    const [profile, setProfile] = useState<Profile | undefined>(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | undefined>(undefined);

    const getProfile = useCallback(
        async (input: GetProfileInput) => {
            setLoading(true);
            setError(undefined);
            try {
                const response = await fetch("/api/profile", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(input),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setProfile(data.profile);
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                setError(error);
                console.error("Failed to fetch profile:", error);
            } finally {
                setLoading(false);
            }
        },
        []
    );

    return useMemo(
        () => ({
            profile,
            loading,
            error,
            getProfile,
        }),
        [profile, loading, error, getProfile]
    );
}
