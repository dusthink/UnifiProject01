import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary mx-auto">
            <FileText className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-tos-title">Terms of Service</h1>
          <p className="text-muted-foreground text-sm">Last updated: March 2026</p>
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              By creating an account and using the UniFi MDU Manager platform ("the Service"), you acknowledge
              and agree to the following terms and conditions. If you do not agree to these terms, you may not
              use the Service.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">2. Unofficial API Usage</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              The Service integrates with Ubiquiti UniFi network equipment using an <strong>unofficial,
              undocumented API</strong> provided by UniFi controllers and UniFi OS consoles. This API is not
              publicly supported, endorsed, or guaranteed by Ubiquiti Inc.
            </p>
            <p>You acknowledge and accept that:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                The UniFi API may change, break, or become unavailable at any time due to firmware updates
                or changes made by Ubiquiti Inc., without prior notice.
              </li>
              <li>
                The Service is not affiliated with, endorsed by, or sponsored by Ubiquiti Inc. "UniFi" and
                related trademarks are the property of Ubiquiti Inc.
              </li>
              <li>
                Ubiquiti Inc. bears no responsibility for any issues arising from the use of this Service
                or its integration with UniFi products.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">3. Supported Versions</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              The Service is tested against and only supports <strong>verified versions</strong> of the
              following Ubiquiti software and hardware:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>UniFi OS</strong> — specific verified firmware versions for UniFi Dream Machine,
                UniFi Dream Router, UniFi Cloud Gateway, and similar UniFi OS-based consoles.
              </li>
              <li>
                <strong>UniFi Network Application</strong> — specific verified versions of the UniFi
                Network controller software.
              </li>
            </ul>
            <p>
              Running the Service against unverified or unsupported firmware versions may result in
              unexpected behavior, data loss, or network disruption. It is your responsibility to ensure
              your equipment is running a supported version before using the Service.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">4. No Warranty</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              The Service is provided <strong>"as is"</strong> and <strong>"as available"</strong> without
              warranties of any kind, whether express or implied, including but not limited to warranties of
              merchantability, fitness for a particular purpose, or non-infringement.
            </p>
            <p>
              We do not warrant that the Service will be uninterrupted, error-free, or that any defects
              will be corrected. Use of the Service is at your sole risk.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">5. Limitation of Liability</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              To the fullest extent permitted by law, the Service providers shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, including but not limited to:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Network downtime or disruption caused by API changes or incompatibilities</li>
              <li>Loss of network configuration data</li>
              <li>Unauthorized access resulting from misconfiguration</li>
              <li>Any damages arising from the use of unsupported firmware versions</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">6. Your Responsibilities</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                You are responsible for maintaining proper backups of your UniFi controller configuration.
              </li>
              <li>
                You are responsible for ensuring your UniFi equipment runs a supported firmware version.
              </li>
              <li>
                You are responsible for securing the credentials used to connect to your UniFi controllers.
              </li>
              <li>
                You agree not to use the Service in any manner that could damage, disable, or impair
                your network infrastructure.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">7. Changes to Terms</h2>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4">
            <p>
              We reserve the right to modify these terms at any time. Continued use of the Service after
              changes constitutes acceptance of the updated terms. Users will be notified of material
              changes through the Service interface.
            </p>
          </CardContent>
        </Card>

        <div className="text-center pb-8">
          <Button variant="outline" onClick={() => window.history.back()} data-testid="button-tos-back">
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
