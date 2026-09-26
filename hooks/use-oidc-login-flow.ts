import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "./use-wallet-adapter";
import {
    buildMessage,
    completeInteraction,
    fetchInteraction,
    OidcLoginError,
    resolveIssuer,
    type OidcClient,
    type OidcInteraction,
} from "../services/oidc";

const INVALID_LINK_MESSAGE = "This sign-in link has expired or is no longer valid.";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Tagged union of the paint states the OIDC login flow can be in. Owning
 * this here (instead of derived booleans in the view) keeps invalid
 * combinations unrepresentable, mirroring `useConsoleAuthFlow`.
 */
export type OidcLoginFlowView =
    | { kind: "invalid" }
    | { kind: "loading" }
    | { kind: "pre-login"; client: OidcClient }
    | {
          kind: "ready";
          client: OidcClient;
          address: string;
          submit: () => Promise<void>;
          submitting: boolean;
      }
    | { kind: "denied"; client: OidcClient; message: string }
    | { kind: "error"; message: string };

interface FetchRecord {
    key: string;
    interaction: OidcInteraction | null;
    errorMessage: string | null;
}

const EMPTY_FETCH_RECORD: FetchRecord = { key: "", interaction: null, errorMessage: null };

interface SubmitOutcome {
    key: string;
    deniedMessage: string | null;
    errorMessage: string | null;
}

const EMPTY_SUBMIT_OUTCOME: SubmitOutcome = { key: "", deniedMessage: null, errorMessage: null };

export function useOidcLoginFlow(requestId: string | undefined, issuer?: string): OidcLoginFlowView {
    const resolvedIssuer = useMemo(() => resolveIssuer(issuer), [issuer]);
    const session = useSession();

    // Tying the fetch result to a key derived from issuer+requestId means a
    // change of either simply stops matching `fetchRecord.key` below, without
    // needing a synchronous setState at the top of the effect to reset state
    // (see useConsoleAuthFlow's completionKey for the same pattern).
    const requestKey = requestId ? `${resolvedIssuer}:${requestId}` : "";
    const [fetchRecord, setFetchRecord] = useState<FetchRecord>(EMPTY_FETCH_RECORD);

    const interactionLoaded = requestKey !== "" && fetchRecord.key === requestKey;
    const interaction = interactionLoaded ? fetchRecord.interaction : null;
    const fetchErrorMessage = interactionLoaded ? fetchRecord.errorMessage : null;
    const loadingInteraction = requestId !== undefined && !interactionLoaded;

    const [submitting, setSubmitting] = useState(false);

    // Keyed the same way as `fetchRecord`: a submit outcome (denied/error)
    // from a previous request/issuer stops matching `requestKey` the moment
    // either changes, instead of lingering across a Pages Router client-side
    // navigation (which doesn't remount this hook) to a different request id.
    const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome>(EMPTY_SUBMIT_OUTCOME);
    const submitOutcomeCurrent = requestKey !== "" && submitOutcome.key === requestKey;
    const deniedMessage = submitOutcomeCurrent ? submitOutcome.deniedMessage : null;
    const submitErrorMessage = submitOutcomeCurrent ? submitOutcome.errorMessage : null;

    useEffect(() => {
        if (!requestId) return;

        const key = requestKey;
        let cancelled = false;

        void (async () => {
            try {
                const data = await fetchInteraction(resolvedIssuer, requestId);
                if (!cancelled) setFetchRecord({ key, interaction: data, errorMessage: null });
            } catch (e) {
                if (cancelled) return;
                console.error("Failed to fetch OIDC interaction:", e);
                setFetchRecord({ key, interaction: null, errorMessage: INVALID_LINK_MESSAGE });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [requestId, resolvedIssuer, requestKey]);

    const submit = useCallback(async () => {
        if (!interaction || !session || !requestId) return;

        setSubmitting(true);
        setSubmitOutcome(EMPTY_SUBMIT_OUTCOME);
        try {
            const message = buildMessage(interaction.siwe, session.address, session.chainId);
            const signature = await session.signer.signMessage(message);
            const { redirect } = await completeInteraction(resolvedIssuer, requestId, message, signature);
            window.location.assign(redirect);
        } catch (e) {
            if (e instanceof OidcLoginError && e.code === "access_denied") {
                setSubmitOutcome({
                    key: requestKey,
                    deniedMessage: e.description ?? "Access denied.",
                    errorMessage: null,
                });
            } else {
                console.error("Failed to complete OIDC interaction:", e);
                setSubmitOutcome({ key: requestKey, deniedMessage: null, errorMessage: GENERIC_ERROR_MESSAGE });
            }
        } finally {
            setSubmitting(false);
        }
    }, [interaction, session, requestId, resolvedIssuer, requestKey]);

    return useMemo<OidcLoginFlowView>(() => {
        if (!requestId) return { kind: "invalid" };
        if (loadingInteraction) return { kind: "loading" };
        if (fetchErrorMessage) return { kind: "error", message: fetchErrorMessage };
        if (!interaction) return { kind: "loading" };
        if (deniedMessage) return { kind: "denied", client: interaction.client, message: deniedMessage };
        if (submitErrorMessage) return { kind: "error", message: submitErrorMessage };
        if (!session) return { kind: "pre-login", client: interaction.client };

        return {
            kind: "ready",
            client: interaction.client,
            address: session.address,
            submit,
            submitting,
        };
    }, [
        requestId,
        loadingInteraction,
        fetchErrorMessage,
        interaction,
        deniedMessage,
        submitErrorMessage,
        session,
        submit,
        submitting,
    ]);
}
