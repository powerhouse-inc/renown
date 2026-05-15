import { useAppIcon } from "../../hooks/useAppIcon";
import { didKeyText } from "../../utils/did";

interface IProps {
    appId: string;
    returnUrl?: string;
    className?: string;
}

const AppCard: React.FC<IProps> = ({ appId, returnUrl, className = "" }) => {
    const { src, onError } = useAppIcon(returnUrl);

    return (
        <div className={`rounded-xl p-4 bg-secondary flex gap-3 w-full ${className}`}>
            <div className="w-9 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="Application" width={36} height={36} onError={onError} className="w-9 h-9" />
            </div>
            <div className="flex-1">
                <h3 className="text-foreground font-medium">
                    {returnUrl
                        ? <a href={returnUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{new URL(returnUrl).hostname}</a>
                        : 'Connected Application'}
                </h3>
                <p className="text-muted-foreground text-sm">{didKeyText(appId)}</p>
            </div>
        </div>
    );
};

export default AppCard;
