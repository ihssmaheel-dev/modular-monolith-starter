import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./field";

const meta = {
  title: "Primitives/Field",
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grouped: Story = {
  render: () => (
    <FieldSet className="w-72">
      <FieldLegend>Profile</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="story-field-name">Name</FieldLabel>
          <Input id="story-field-name" defaultValue="Ada Lovelace" />
          <FieldDescription>Shown to workspace members.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="story-field-email">Email</FieldLabel>
          <Input id="story-field-email" defaultValue="not-an-email" aria-invalid />
          <FieldError>Enter a valid email address.</FieldError>
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
};
