import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "./carousel";

const meta = {
  title: "Primitives/Carousel",
  component: Carousel,
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Carousel {...args} className="w-96">
      <CarouselContent>
        {["Notes", "Files", "Settings"].map((title) => (
          <CarouselItem key={title} className="basis-2/3">
            <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/40">
              <p className="text-sm font-medium">{title}</p>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious aria-label="Previous slide" />
      <CarouselNext aria-label="Next slide" />
    </Carousel>
  ),
};
