import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "./chart";

const data = [
  { week: "W1", notes: 12 },
  { week: "W2", notes: 19 },
  { week: "W3", notes: 8 },
  { week: "W4", notes: 24 },
];

const config: ChartConfig = {
  notes: { label: "Notes", color: "var(--chart-1)" },
};

const meta = {
  title: "Primitives/Chart",
  component: ChartContainer,
  args: { config },
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BarChartStory: Story = {
  name: "Bar chart",
  args: {
    config,
    children: (
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} />
        <Bar dataKey="notes" fill="var(--color-notes)" radius={4} />
      </BarChart>
    ),
  },
  render: (args) => <ChartContainer {...args} config={config} className="w-96" />,
};
