import IconCheck from "../assets/icons/check.svg";
import Image from "next/image";
import { useCredential } from "../hooks/credential";
import { useRef } from "react";
import IconConnect from "../assets/icons/connect.svg";
interface IProps {
    connectId: string;
    returnUrl?: string;
}
function ConnectIdText(id: string) {
    return id.length < 20 ? id : `${id.slice(0, 8)}...${id.slice(-5)}`;
}

const Credential: React.FC<IProps> = ({ connectId, returnUrl }) => {
    const { hasCredential, credential, revokeCredential } =
        useCredential(connectId);
    const dialogRef = useRef<HTMLDialogElement>(null);
    let revoking = false;

    if (!hasCredential) {
        return null;
    }

    return (
        <div className="flex flex-col w-full">
            <div className="rounded-xl p-4 px-6 flex gap-3 w-full">
                <Image src={IconCheck} alt="Confirmed" width={36} height={36} />
                <div className="flex flex-col flex-1">
                    <h3 className="font-medium">
                        Authorization confirmed
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                        <button
                            className="text-link underline underline-offset-4 text-sm"
                            onClick={() => {
                                dialogRef.current?.showModal();
                            }}
                        >
                            View details
                        </button>
                        <button
                            className={`text-red underline underline-offset-4 text-sm ${
                                revoking && "animate-pulse pointer-events-none"
                            }`}
                            disabled={revoking || !credential}
                            onClick={() => revokeCredential()}
                        >
                            Revoke
                        </button>
                    </div>
                </div>
                <dialog
                    ref={dialogRef}
                    className="shadow-lg backdrop:bg-transparent backdrop:cursor-pointer p-6 h-4/6"
                    onClick={() => dialogRef.current?.close()}
                >
                    <pre
                        className="text-start"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {credential && JSON.stringify(credential, null, 4)}
                    </pre>
                </dialog>
            </div>
            <div>
                                {/* Connected Application Card */}
                                <div className="rounded-xl p-4 mt-6 bg-neutral-2-light flex gap-3 w-full">
                                <Image src={IconConnect} alt="Application" width={36} height={36} />
                                <div className="flex-1">
                                    <h3 className="text-neutral-5-light font-medium">
                                        {returnUrl ? new URL(returnUrl).hostname : 'Connected Application'}
                                    </h3>
                                    <p className="text-neutral-4 text-sm">
                                        {ConnectIdText(connectId)}
                                    </p>
                                </div>
                            </div>
                            </div>
        </div>
    );
};

export default Credential;
