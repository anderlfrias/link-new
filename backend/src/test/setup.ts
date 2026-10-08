import { setAuthProvider } from "../auth-providers/registry";
import { createFakeProvider } from "./auth-mode";

// Por defecto los tests corren con un proveedor de autenticación externo (el de
// mentira de `createFakeProvider`); los que necesitan cuentas locales usan
// `useLocalAuth()`. Se carga en cada archivo de test antes de ejecutarlo.
setAuthProvider(createFakeProvider());
