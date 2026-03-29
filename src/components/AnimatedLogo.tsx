import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedLogoProps {
  className?: string;
}

export const AnimatedLogo = ({ className }: AnimatedLogoProps) => {
  const [currentLogo, setCurrentLogo] = useState(0);
  const logos = ['/logo1.jpg', '/logo2.jpg'];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentLogo((prev) => (prev === 0 ? 1 : 0));
    }, 3000); // Switch every 3 seconds

    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-full ${className}`}>
      <AnimatePresence mode="wait">
        <motion.img
          key={logos[currentLogo]}
          src={logos[currentLogo]}
          alt="Xeno Logo"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          className="w-full h-full object-cover"
        />
      </AnimatePresence>
    </div>
  );
};
