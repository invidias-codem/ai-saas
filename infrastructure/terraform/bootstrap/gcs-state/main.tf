terraform {
  required_version = "= 1.16.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "= 7.30.0"
    }
  }
}

provider "google" {
  project = var.project_id
}

variable "project_id" {
  description = "Existing, independently approved dedicated nonproduction GCP project."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^lattice-iac-sandbox-[a-z0-9]([a-z0-9-]{0,8}[a-z0-9])?$", var.project_id))
    error_message = "Use a dedicated lattice-iac-sandbox-* project ID (maximum 30 characters)."
  }
}

variable "location" {
  description = "Operator-approved US region for the state bucket."
  type        = string
  nullable    = false

  validation {
    condition     = contains(["US-EAST1", "US-EAST4", "US-CENTRAL1"], var.location)
    error_message = "Select an approved pilot region: US-EAST1, US-EAST4, or US-CENTRAL1."
  }
}

variable "state_writer_account_id" {
  description = "Existing dedicated state writer service account ID in the same project."
  type        = string
  nullable    = false

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.state_writer_account_id))
    error_message = "Provide a valid service account ID, not an email or external principal."
  }
}

resource "google_storage_bucket" "state" {
  project                     = var.project_id
  name                        = "${var.project_id}-tfstate"
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  labels = {
    environment = "sandbox"
    purpose     = "terraform-state"
    managed_by  = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "state_writer" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.state_writer_account_id}@${var.project_id}.iam.gserviceaccount.com"
}

output "bucket_name" {
  description = "Name of the dedicated Terraform state backend bucket."
  value       = google_storage_bucket.state.name
}
