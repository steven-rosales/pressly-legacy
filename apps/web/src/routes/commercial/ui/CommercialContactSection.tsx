'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/common/shadcn/form';
import { Input } from '@/common/shadcn/input';
import { Textarea } from '@/common/shadcn/textarea';
import PrimaryButton from '@/common/ui/primitives/PrimaryButton';

const formSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  location: z.string().min(1, 'Location is required'),
  needs: z.string().min(10, 'Please tell us more about your needs'),
});

export default function CommercialContactSection() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      location: '',
      needs: '',
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    void values;
    // TODO: Handle form submission
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-start w-full">
      <div className="w-full lg:w-1/2">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4 lg:mb-6">
          Get Started Today
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground mb-6 lg:mb-8">
          Fill out the form below and our team will get back to you within 24
          hours.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="john@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="New York, NY" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="needs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tell us more about your needs</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Please describe your commercial laundry needs..."
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PrimaryButton type="submit" className="w-full">
              Submit Request
            </PrimaryButton>
          </form>
        </Form>
      </div>

      <div className="w-full lg:w-1/2">
        <h3 className="text-2xl sm:text-3xl font-semibold mb-4">
          Enterprise Laundry Solutions for Your Business
        </h3>
        <div className="space-y-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
          <p>
            Running a business comes with enough moving parts—your laundry
            shouldn’t be one of them. Whether you manage a busy office, a
            wellness studio, or a growing hospitality team, we’re here to keep
            things fresh, clean, and always ready to go.
          </p>
          <p>
            From reliable pickups to high-quality cleaning, our commercial
            services are designed to give you peace of mind and one less thing
            to worry about. We handle everything with care, consistency, and a
            focus on making your days a little easier.
          </p>
          <p>
            If you have unique needs or special items, just let us know. We’ll
            work with you to build a simple, flexible plan that fits your
            workflow and helps your team shine.
          </p>
        </div>
      </div>
    </div>
  );
}
