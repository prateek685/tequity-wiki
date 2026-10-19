import { node, typescript } from "@portal/config/eslint";

export default [...typescript({ tsconfigRootDir: import.meta.dirname }), ...node()];
