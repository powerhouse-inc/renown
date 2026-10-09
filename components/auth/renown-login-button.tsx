"use client";

import { useRenownAuth } from "@powerhousedao/reactor-browser/renown";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getProfile } from "../../services/switchboard";
import { ProfileAvatar } from "../profile/profile-avatar";

interface RenownLoginButtonProps {
  className?: string;
}

const RenownLoginButton: React.FC<RenownLoginButtonProps> = ({
  className = "",
}) => {
  const { user, status, displayName, avatarUrl, profileId, login, logout } =
    useRenownAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<{ address: string; avatar: string | null } | null>(null);
  const address = user?.address;
  const avatar = own && own.address === address ? own.avatar : null;

  // Only a profile with an uploaded avatar may request /media; everyone else
  // gets their external image or an identicon, without a doomed 404 request.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void getProfile({
      driveId: `renown-${address.toLowerCase()}`,
      ethAddress: address.toLowerCase(),
    }).then((profile) => {
      if (!cancelled) setOwn({ address, avatar: profile?.avatar ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await logout();
  };

  const handleViewProfile = () => {
    setIsDropdownOpen(false);
    if (profileId) {
      window.location.href = `/profile/${profileId}`;
    }
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isLoading = status === undefined || status === "loading" || status === "checking";

  if (isLoading) {
    return (
      <div
        className={`flex h-10 items-center justify-center rounded-lg bg-foreground/10 px-4 ${className}`}
      >
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <button
        onClick={() => void login()}
        className={`flex h-10 items-center gap-2 rounded-lg border border-foreground/20 bg-transparent px-4 font-semibold text-foreground transition-colors hover:bg-foreground/10 ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
        Login
      </button>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex h-10 items-center gap-2 rounded-lg bg-foreground/10 px-3 transition-colors hover:bg-foreground/20"
      >
        <ProfileAvatar
          documentId={profileId}
          avatar={avatar}
          userImage={avatarUrl}
          seed={user.address}
          alt={displayName || user.address}
          className="h-6 w-6"
        />
        <span className="font-medium text-foreground">
          {displayName || truncateAddress(user.address)}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-foreground transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isDropdownOpen && (
        <div className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-lg border border-border bg-background shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium text-foreground">
              {displayName || "Anonymous"}
            </p>
            <p className="text-xs text-muted-foreground">
              {truncateAddress(user.address)}
            </p>
          </div>
          <div className="py-1">
            <Link
              href="/profile/edit"
              onClick={() => setIsDropdownOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit profile
            </Link>
            <button
              onClick={handleViewProfile}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              View Profile
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RenownLoginButton;
