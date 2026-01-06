const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const getFileSystemBaseUrl = (): string => {
  const envValue = process.env.NEXT_PUBLIC_FILE_SYSTEM_URL;
  if (envValue) {
    return trimTrailingSlash(envValue);
  }

  if (typeof window !== "undefined") {
    // Prefer relative paths so Next.js rewrites can proxy to the file system backend.
    return "";
  }

  return "http://localhost:3001";
};

export const getWsBaseUrl = (): string => {
  const envValue = process.env.NEXT_PUBLIC_WS_URL;
  if (envValue) {
    return trimTrailingSlash(envValue);
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:3001`;
  }

  return "ws://localhost:3001";
};
