import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Ada Lovelace", "aria-label": "Name" },
};

export const Disabled: Story = {
  args: { defaultValue: "Read-only value", disabled: true, "aria-label": "Name" },
};

export const Invalid: Story = {
  args: { defaultValue: "not-an-email", "aria-invalid": true, "aria-label": "Email" },
};

export const InField: Story = {
  render: () => (
    <div className="w-72 space-y-4">
      <Field>
        <FieldLabel htmlFor="story-email">Email</FieldLabel>
        <Input id="story-email" type="email" placeholder="ada@example.com" />
        <FieldDescription>Used for sign-in and receipts.</FieldDescription>
      </Field>
      <Field>
        <Label htmlFor="story-name">Name</Label>
        <Input id="story-name" defaultValue="" placeholder="Ada Lovelace" aria-invalid />
        <FieldError>This field is required.</FieldError>
      </Field>
    </div>
  ),
};
