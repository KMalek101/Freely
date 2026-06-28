declare module "ink-spinner" {
  import type { ComponentType } from "react";
  interface SpinnerProps {
    type?: string;
  }
  const Spinner: ComponentType<SpinnerProps>;
  export default Spinner;
}

declare module "ink-text-input" {
  import type { ComponentType } from "react";
  interface TextInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
    placeholder?: string;
  }
  const TextInput: ComponentType<TextInputProps>;
  export default TextInput;
}
