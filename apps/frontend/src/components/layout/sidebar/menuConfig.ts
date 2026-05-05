import type { ComponentType, SVGProps } from "react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

export type MenuItem = {
  name: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

export type MenuTone =
  | "indigo"
  | "sky"
  | "emerald"
  | "rose"
  | "amber";

export type MenuSection = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: MenuItem[];
  tone: MenuTone;
  defaultOpen?: boolean;
};

export const menuSections: MenuSection[] = [
  {
    id: "renew",
    title: "Hệ thống Renew",
    description: "Quản trị Adobe admin và nhóm sản phẩm hệ thống.",
    icon: ArrowPathIcon,
    tone: "amber",
    defaultOpen: true,
    items: [
      {
        name: "Danh sách Admin Adobe",
        href: "/renew-adobe-admin",
        icon: UserGroupIcon,
      },
      {
        name: "Kiểm tra Profile (Renew)",
        href: "/renew-adobe-check",
        icon: MagnifyingGlassIcon,
      },
      {
        name: "Đơn Renew (bàn làm việc)",
        href: "/renew-orders",
        icon: RectangleStackIcon,
      },
    ],
  },
];
