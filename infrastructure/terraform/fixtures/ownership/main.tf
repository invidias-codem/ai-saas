terraform {
  required_version = "= 1.16.7"
}

variable "environment" {
  description = "Synthetic environment for this credential-free fixture."
  type        = string
  default     = "sandbox"
  nullable    = false

  validation {
    condition     = var.environment == "sandbox"
    error_message = "Only the synthetic sandbox environment is supported."
  }
}

resource "terraform_data" "ownership" {
  input = {
    environment      = var.environment
    management_plane = "terraform"
    runtime_owner    = "lattice-execution-plane"
    cloud_mutations  = false
  }
}

output "ownership" {
  description = "Synthetic infrastructure ownership contract, not a cloud inventory."
  value       = terraform_data.ownership.input
}
