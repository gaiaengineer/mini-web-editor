import type { PreviewScreen } from "@/lib/epub/preview";

export type PreviewDevice = {
  id: string;
  label: string;
  // The whole screen in CSS pixels. The reading area is what's left between the
  // system bars, so a book gets the room it would get on the real device.
  width: number;
  height: number;
  topBar: number;
  bottomBar: number;
  bezel: number;
  // The outer corners. The screen's follow from them and the bezel.
  radius: number;
  body: string;
  camera: "island" | "punch-hole" | "bezel";
  clock: string;
  screen: PreviewScreen;
};

const INK = "#1c2024";
const BLACK = "#16171a";

export const PREVIEW_DEVICES: PreviewDevice[] = [
  {
    id: "iphone",
    label: "iPhone",
    width: 393,
    height: 852,
    topBar: 59,
    bottomBar: 34,
    bezel: 11,
    radius: 62,
    body: "#2c2c2f",
    camera: "island",
    clock: "9:41",
    screen: { paper: "#ffffff", ink: INK, fontSize: 18, margin: 24 },
  },
  {
    id: "ipad",
    label: "iPad",
    width: 834,
    height: 1194,
    topBar: 32,
    bottomBar: 22,
    bezel: 22,
    radius: 38,
    body: BLACK,
    camera: "bezel",
    clock: "9:41",
    screen: { paper: "#ffffff", ink: INK, fontSize: 20, margin: 72 },
  },
  {
    id: "galaxy",
    label: "Samsung Galaxy A",
    width: 412,
    height: 892,
    topBar: 38,
    bottomBar: 26,
    bezel: 10,
    radius: 38,
    body: "#202226",
    camera: "punch-hole",
    clock: "12:30",
    screen: { paper: "#ffffff", ink: INK, fontSize: 18, margin: 24 },
  },
  {
    id: "galaxy-tab",
    label: "Samsung Galaxy Tab",
    width: 800,
    height: 1280,
    topBar: 32,
    bottomBar: 24,
    bezel: 26,
    radius: 30,
    body: "#25272b",
    camera: "bezel",
    clock: "12:30",
    screen: { paper: "#ffffff", ink: INK, fontSize: 20, margin: 64 },
  },
];
