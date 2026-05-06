import Image from "next/image";
import Header from "../assets/images/header.jpg";
import IconRenown from "../assets/icons/renown.svg";

interface RenownCardProps {
  children: React.ReactNode;
  className?: string;
}

export const RenownCard: React.FC<RenownCardProps> = ({ children, className = "" }) => {
  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white/80 shadow-2xl backdrop-blur-lg dark:border-white/20 dark:bg-white/10 ${className}`}>
      {/* Card Header */}
      <div className="relative h-[106px]">
        <Image
          priority
          src={Header}
          alt="Powerhouse"
          className="h-[106px] w-full object-cover"
        />
        <Image
          src={IconRenown}
          alt="Renown"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
        />
      </div>

      {/* Card Content */}
      {children}
    </div>
  );
};

export default RenownCard;
