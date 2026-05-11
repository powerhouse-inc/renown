import Image from "next/image";
import LandingGradient from "../assets/images/landing-gradient.jpg";
import Noise from "../assets/images/noise.png";
import PhIconsBackground from "./ph-icons-background";
import RenownLogo from "./renown-logo";
import ThemeToggle from "./theme-toggle";
import RenownLoginButton from "./renown-login-button";

interface PageBackgroundProps {
  children: React.ReactNode;
}

const PageBackground: React.FC<PageBackgroundProps> = ({ children }) => {
  return (
    <div className="relative overflow-hidden min-h-screen">
      {/* Dark mode background images */}
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
      </div>

      <div className="absolute w-screen top-0 bottom-0 overflow-hidden z-0 pointer-events-none">
        <PhIconsBackground
          aria-label="Renown"
          className="absolute left-0 bottom-0 pointer-events-none"
        />
      </div>

      {/* Header with logo and theme toggle */}
      <div className="absolute left-8 top-3 z-10 flex items-center gap-4">
        <RenownLogo aria-label="Renown" className="text-foreground" />
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
