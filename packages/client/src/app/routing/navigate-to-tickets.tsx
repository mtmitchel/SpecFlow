import { useEffect } from "react";

export const NavigateToTickets = ({
  locationPath,
  navigate
}: {
  locationPath: string;
  navigate: (path: string) => void;
}): null => {
  useEffect(() => {
    if (locationPath === "/") {
      navigate("/tickets");
    }
  }, [locationPath, navigate]);

  return null;
};
