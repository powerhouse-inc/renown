import { useState, useCallback } from 'react';

interface VerifyResponse {
  valid: boolean;
  payload?: {
    iss: string;
    aud: string;
    exp: number;
    iat: number;
    address: string;
    chainId: number;
    connectId?: string;
    credentialId?: string;
    documentId?: string;
  };
  error?: string;
}

export function useVerifyToken() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerifyResponse | null>(null);

  const verifyToken = useCallback(async (token: string, address: string): Promise<VerifyResponse> => {
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, address }),
      });

      const result: VerifyResponse = await response.json();
      setVerificationResult(result);
      return result;
    } catch (error) {
      const errorResult: VerifyResponse = {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification request failed',
      };
      setVerificationResult(errorResult);
      return errorResult;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  return {
    verifyToken,
    isVerifying,
    verificationResult,
  };
}
