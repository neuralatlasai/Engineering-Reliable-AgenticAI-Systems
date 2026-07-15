"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";

interface MobileNavigationProperties {
  readonly children: ReactNode;
}

export function MobileNavigation({ children }: MobileNavigationProperties) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          aria-label="Open book navigation"
          className="icon-button mobile-only"
          type="button"
        >
          <Menu aria-hidden="true" size={20} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content mobile-nav-content">
          <div className="dialog-header">
            <div>
              <Dialog.Title className="dialog-title">
                Book navigation
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                Browse the compiled content graph.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Close book navigation"
                className="icon-button"
                type="button"
              >
                <X aria-hidden="true" size={19} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mobile-nav-scroll">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
