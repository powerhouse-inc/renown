import Image from "next/image";
import RenownLight from "../assets/images/Renown-light.svg";
import LandingGradient from "../assets/images/landing-gradient.jpg";
import Noise from "../assets/images/noise.png";
import PhIcons from "../assets/images/ph-icons.svg";
import ThemeToggle from "./theme-toggle";
import RenownLoginButton from "./renown-login-button";

interface PageBackgroundProps {
  children: React.ReactNode;
}

export const PageBackground: React.FC<PageBackgroundProps> = ({ children }) => {
  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* Dark mode background */}
      <div className="absolute w-screen top-0 bottom-0 overflow-hidden z-0 fill-[#404040] dark:block hidden">
        <Image
          priority
          src={LandingGradient}
          alt="background"
          className="absolute w-[101vw] max-w-none h-full z-0 object-cover"
        />
        <Image
          priority
          src={Noise}
          alt="noise"
          className="absolute w-[101vw] max-w-none h-full z-0 object-cover"
        />
        <Image
          priority
          src={PhIcons}
          alt="Renown"
          className="absolute left-0 bottom-0 pointer-events-none"
        />
      </div>

      {/* Light mode background with images */}
      <div className="absolute w-screen top-0 bottom-0 overflow-hidden z-0 dark:hidden block">
        <Image
          priority
          src={LandingGradient}
          alt="background"
          className="absolute w-[101vw] max-w-none h-full z-0 object-cover opacity-20"
        />
        <Image
          priority
          src={Noise}
          alt="noise"
          className="absolute w-[101vw] max-w-none h-full z-0 object-cover opacity-20"
        />
        <Image
          priority
          src={PhIcons}
          alt="Renown"
          className="absolute left-0 bottom-0 pointer-events-none opacity-10"
        />
        {/* Light background overlay */}
        <div className="absolute w-full h-full bg-white/90" />
      </div>

      {/* Header with logo and theme toggle */}
      <div className="absolute left-8 top-3 z-10 flex items-center gap-4">
        <Image
          priority
          src={RenownLight}
          alt="Renown"
          width={154}
          height={48}
        />
      </div>
      <div className="absolute right-8 top-3 z-10 flex items-center gap-3">
        <RenownLoginButton />
        <ThemeToggle />
      </div>

      {/* Content */}
      {children}
    </div>
  );
};

export default PageBackground;
