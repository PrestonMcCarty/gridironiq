import dynamic from "next/dynamic";

// All data is fetched client-side via useEffect — SSR produces only a loading
// shell and triggers circular-dependency TDZ errors in the server bundle.
// Disabling SSR here is correct for this app architecture.
const ClientApp = dynamic(() => import("./_ClientApp"), { ssr: false });

export default function Page() {
  return <ClientApp />;
}
