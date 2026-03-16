import { Navigate, useParams } from "react-router-dom";

export const SpecView = () => {
  const { id, type } = useParams<{ id: string; type: string }>();
  const nextType =
    type === "brief" || type === "core-flows" || type === "prd" || type === "tech-spec" ? type : "brief";

  return <Navigate to={`/initiative/${id ?? ""}?step=${nextType}`} replace />;
};
