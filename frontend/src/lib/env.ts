function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  socketUrl: required("NEXT_PUBLIC_SOCKET_URL", process.env.NEXT_PUBLIC_SOCKET_URL),
};
