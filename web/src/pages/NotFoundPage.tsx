import { Link } from "react-router";
import { PageTitle } from "../components/ui";

export function NotFoundPage() {
  return (
    <div>
      <PageTitle>Page not found</PageTitle>
      <p className="text-ink-2">
        That page doesn't exist.{" "}
        <Link to="/" className="font-semibold text-accent underline">
          Go to today
        </Link>
      </p>
    </div>
  );
}
