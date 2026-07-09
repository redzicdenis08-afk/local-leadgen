import { generateLocalBusinessSchema } from "../examples/schema_mock_generator";

describe("Schema Generator", () => {
  it("should generate correct addressLocality", () => {
    const res = generateLocalBusinessSchema("Roof Pro", "Knoxville");
    expect(res.address.addressLocality).toBe("Knoxville");
  });
});
