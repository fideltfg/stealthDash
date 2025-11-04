declare module 'justgage' {
  interface JustGageOptions {
    id: string;
    value: number;
    min: number;
    max: number;
    title?: string;
    label?: string;
    pointer?: boolean;
    customSectors?: Array<{
      color: string;
      lo: number;
      hi: number;
    }>;
    counter?: boolean;
    gaugeColor?: string;
    titleFontColor?: string;
    valueFontColor?: string;
    labelFontColor?: string;
    shadowOpacity?: number;
    [key: string]: any;
  }

  class JustGage {
    constructor(options: JustGageOptions);
    refresh(value: number): void;
    destroy(): void;
  }

  export default JustGage;
}
