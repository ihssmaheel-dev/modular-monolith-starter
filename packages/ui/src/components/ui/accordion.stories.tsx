import type { Meta, StoryObj } from "@storybook/react-vite";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const meta = {
  title: "Primitives/Accordion",
  component: Accordion,
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Accordion {...args} defaultValue={["billing"]} className="w-96">
      <AccordionItem value="account">
        <AccordionTrigger>Account settings</AccordionTrigger>
        <AccordionContent>Change your name, email, and avatar.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="billing">
        <AccordionTrigger>Billing</AccordionTrigger>
        <AccordionContent>Invoices, plan, and payment method.</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
