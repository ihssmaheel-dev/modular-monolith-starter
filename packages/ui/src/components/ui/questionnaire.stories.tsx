import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Questionnaire,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireItem,
  QuestionnaireProgress,
  QuestionnaireTitle,
} from "./questionnaire";

const meta = {
  title: "Primitives/Questionnaire",
  component: Questionnaire,
} satisfies Meta<typeof Questionnaire>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Questionnaire
      {...args}
      items={[{ name: "plan", choices: [{ value: "free" }, { value: "pro" }] }]}
      className="w-96"
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="plan">
        <QuestionnaireTitle>Choose a plan</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="free">Free</QuestionnaireChoice>
          <QuestionnaireChoice value="pro" defaultChecked>
            Pro
          </QuestionnaireChoice>
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <Button type="submit" size="sm">
        Continue
      </Button>
    </Questionnaire>
  ),
};
