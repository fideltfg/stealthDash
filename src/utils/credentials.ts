/**
 * Shared credential-selector helper for widget config dialogs.
 */

import { credentialsService } from '../services/credentials';

/**
 * Populate a <select> element with credentials of the given service type(s).
 * Pre-selects the option matching currentCredentialId if provided.
 */
export async function populateCredentialSelect(
  selectEl: HTMLSelectElement,
  serviceType: string | string[],
  currentCredentialId?: number | string
): Promise<void> {
  try {
    const credentials = await credentialsService.getAll();
    const types = Array.isArray(serviceType) ? serviceType : [serviceType];
    const filtered = credentials.filter(c => types.includes(c.service_type));

    filtered.forEach(cred => {
      const option = document.createElement('option');
      option.value = cred.id.toString();
      option.textContent = `🔑 ${cred.name}${cred.description ? ` - ${cred.description}` : ''}`;
      selectEl.appendChild(option);
    });

    if (currentCredentialId) {
      selectEl.value = currentCredentialId.toString();
    }
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}
