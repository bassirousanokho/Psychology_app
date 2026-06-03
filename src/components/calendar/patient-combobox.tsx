"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PatientOption = {
  id: string;
  firstName: string;
  lastName: string;
};

interface PatientComboboxProps {
  patients: PatientOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PatientCombobox({
  patients,
  value,
  onChange,
  placeholder = "Select patient…",
}: PatientComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = patients.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        {selected
          ? `${selected.lastName}, ${selected.firstName}`
          : placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name…" />
          <CommandList>
            <CommandEmpty>No patients found.</CommandEmpty>
            <CommandGroup>
              {patients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={`${patient.lastName} ${patient.firstName}`}
                  onSelect={() => {
                    onChange(patient.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === patient.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {patient.lastName}, {patient.firstName}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
