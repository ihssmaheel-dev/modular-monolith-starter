import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ImageCropperDialog } from "./image-cropper-dialog";

const SAMPLE_IMAGE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect fill="#4f46e5" width="600" height="400"/><circle cx="300" cy="180" r="80" fill="#facc15"/><rect x="150" y="280" width="300" height="120" rx="60" fill="#f43f5e"/><text x="300" y="200" font-family="sans-serif" font-size="24" fill="#ffffff" text-anchor="middle">Sample Avatar</text></svg>',
  );

const meta = {
  title: "Composed/ImageCropperDialog",
  component: ImageCropperDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    onCropComplete: fn(),
    imageSrc: SAMPLE_IMAGE,
  },
} satisfies Meta<typeof ImageCropperDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    cropShape: "round",
    aspectRatio: 1,
    title: "Adjust profile photo",
    description: "Drag to position and use the slider to zoom.",
  },
};

export const SquareCrop: Story = {
  args: {
    cropShape: "rect",
    aspectRatio: 1,
    title: "Crop image",
    description: "Position your image inside the crop bounds.",
  },
};

export const Pending: Story = {
  args: {
    isPending: true,
    title: "Saving profile photo",
    description: "Please wait while the photo is being processed.",
  },
};
