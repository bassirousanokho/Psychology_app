"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import type { PatientRow } from "./types";
import { patientColumns } from "./patient-columns";
import { phoneSearchDigits } from "@/lib/phone";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PatientTableProps {
  patients: PatientRow[];
  initialQuery?: string;
  defaultTariffLabel?: string;
  region?: string;
}

/** Lowercase, accent-free, trimmed — so "  éloïse" matches "Eloise". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Matches name or email by text, and phone by digits in any format (06…, +33 6…, 336…). */
const patientSearch: FilterFn<PatientRow> = (row, _columnId, query: string) => {
  const q = normalize(query);
  if (!q) return true;
  const p = row.original;
  const text = normalize(`${p.lastName} ${p.firstName} ${p.firstName} ${p.lastName} ${p.email ?? ""}`);
  if (text.includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 2 && phoneSearchDigits(p.phone).some((d) => d.includes(digits));
};

export function PatientTable({ patients, initialQuery = "", defaultTariffLabel, region }: PatientTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState(initialQuery);

  const table = useReactTable({
    data: patients,
    columns: patientColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: patientSearch,
    meta: { defaultTariffLabel, region },
    enableSortingRemoval: false, // header clicks toggle asc ↔ desc, never back to "unsorted"
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search patients…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ArrowUp className="ml-2 h-3 w-3" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ArrowDown className="ml-2 h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="ml-2 h-3 w-3 opacity-40" />
                        )}
                      </Button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={patientColumns.length} className="h-32 text-center text-muted-foreground">
                  {globalFilter ? "No patients match your search." : "No patients yet. Add your first one!"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {table.getFilteredRowModel().rows.length} patient
        {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
