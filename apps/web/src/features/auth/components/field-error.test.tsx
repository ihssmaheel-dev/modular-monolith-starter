import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { FieldError } from "./field-error";

describe("FieldError", () => {
  it("renders the translated message", () => {
    renderWithProviders(<FieldError message="Invalid email address" />);

    expect(screen.getByText("Invalid email address")).toBeInTheDocument();
  });

  it("renders nothing without a message", () => {
    const { container } = renderWithProviders(<FieldError />);

    expect(container).toBeEmptyDOMElement();
  });
});
